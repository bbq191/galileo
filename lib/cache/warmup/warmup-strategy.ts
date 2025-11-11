/**
 * WarmupStrategy - 缓存预热策略配置
 *
 * 职责：
 * - 定义分层预热策略（P0-P3）
 * - 配置预热触发器（启动/定时/手动）
 * - 管理预热优先级和顺序
 */

/**
 * 预热优先级
 */
export enum WarmupPriority {
  /** P0: 核心数据（数据库列表、数据源配置） */
  P0 = 'P0',

  /** P1: 热表元数据（Top 50，基于访问频率） */
  P1 = 'P1',

  /** P2: 热门查询模式（Top 20） */
  P2 = 'P2',

  /** P3: 业务规则、分表模式 */
  P3 = 'P3',
}

/**
 * 预热触发器
 */
export enum WarmupTrigger {
  /** 系统启动时（快速预热 P0+P1） */
  ON_STARTUP = 'on_startup',

  /** 每日凌晨 3:00（全量预热 P0-P3） */
  SCHEDULED_DAILY = 'scheduled_daily',

  /** 每 6 小时（增量预热 P1） */
  SCHEDULED_HOURLY = 'scheduled_hourly',

  /** 手动触发 */
  MANUAL = 'manual',

  /** 元数据同步后 */
  ON_METADATA_SYNC = 'on_metadata_sync',
}

/**
 * 预热策略配置
 */
export interface WarmupStrategyConfig {
  /** 优先级 */
  priority: WarmupPriority;

  /** 预热内容描述 */
  description: string;

  /** 预热数据量 */
  dataVolume: {
    min: number;
    max: number;
    unit: string;
  };

  /** 是否启用 */
  enabled: boolean;

  /** 预热方法名 */
  warmupMethod: string;

  /** 预估耗时（毫秒） */
  estimatedTime: number;

  /** 触发器列表 */
  triggers: WarmupTrigger[];

  /** 缓存 TTL（秒） */
  cacheTTL: {
    L1: number;
    L2: number;
  };
}

/**
 * 预热策略映射表
 */
export const WARMUP_STRATEGIES: Record<WarmupPriority, WarmupStrategyConfig> = {
  [WarmupPriority.P0]: {
    priority: WarmupPriority.P0,
    description: '核心元数据（数据库列表、数据源配置）',
    dataVolume: {
      min: 5,
      max: 20,
      unit: '条',
    },
    enabled: true,
    warmupMethod: 'warmupCoreMetadata',
    estimatedTime: 500, // 500ms
    triggers: [
      WarmupTrigger.ON_STARTUP,
      WarmupTrigger.SCHEDULED_DAILY,
      WarmupTrigger.ON_METADATA_SYNC,
    ],
    cacheTTL: {
      L1: 120, // 2 分钟
      L2: 1800, // 30 分钟
    },
  },

  [WarmupPriority.P1]: {
    priority: WarmupPriority.P1,
    description: '热表元数据（Top 50，基于访问频率）',
    dataVolume: {
      min: 20,
      max: 50,
      unit: '张表',
    },
    enabled: true,
    warmupMethod: 'warmupHotTables',
    estimatedTime: 2500, // 2.5s
    triggers: [
      WarmupTrigger.ON_STARTUP,
      WarmupTrigger.SCHEDULED_DAILY,
      WarmupTrigger.SCHEDULED_HOURLY,
    ],
    cacheTTL: {
      L1: 60, // 1 分钟
      L2: 600, // 10 分钟
    },
  },

  [WarmupPriority.P2]: {
    priority: WarmupPriority.P2,
    description: '热门查询模式（Top 20）',
    dataVolume: {
      min: 10,
      max: 20,
      unit: '个查询',
    },
    enabled: true,
    warmupMethod: 'warmupHotQueries',
    estimatedTime: 2000, // 2s
    triggers: [WarmupTrigger.ON_STARTUP, WarmupTrigger.SCHEDULED_DAILY],
    cacheTTL: {
      L1: 300, // 5 分钟
      L2: 3600, // 1 小时
    },
  },

  [WarmupPriority.P3]: {
    priority: WarmupPriority.P3,
    description: '业务规则、分表模式',
    dataVolume: {
      min: 10,
      max: 50,
      unit: '个规则',
    },
    enabled: true,
    warmupMethod: 'warmupBusinessRules',
    estimatedTime: 1000, // 1s
    triggers: [WarmupTrigger.SCHEDULED_DAILY],
    cacheTTL: {
      L1: 0, // 不启用 L1
      L2: 86400, // 24 小时
    },
  },
};

/**
 * 获取指定触发器的预热策略列表
 *
 * @param trigger - 触发器类型
 * @returns 需要执行的预热策略列表（按优先级排序）
 */
export function getStrategiesForTrigger(trigger: WarmupTrigger): WarmupStrategyConfig[] {
  const strategies: WarmupStrategyConfig[] = [];

  for (const priority of Object.values(WarmupPriority)) {
    const strategy = WARMUP_STRATEGIES[priority];
    if (strategy.enabled && strategy.triggers.includes(trigger)) {
      strategies.push(strategy);
    }
  }

  // 按优先级排序（P0 最先执行）
  return strategies.sort((a, b) => {
    const priorityOrder = [
      WarmupPriority.P0,
      WarmupPriority.P1,
      WarmupPriority.P2,
      WarmupPriority.P3,
    ];
    return priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority);
  });
}

/**
 * 预估预热总耗时
 *
 * @param trigger - 触发器类型
 * @returns 预估耗时（毫秒）
 */
export function estimateWarmupTime(trigger: WarmupTrigger): number {
  const strategies = getStrategiesForTrigger(trigger);
  return strategies.reduce((total, strategy) => total + strategy.estimatedTime, 0);
}

/**
 * 预热选项
 */
export interface WarmupOptions {
  /** 触发器类型 */
  trigger: WarmupTrigger;

  /** 是否并行执行（默认 false） */
  parallel?: boolean;

  /** 超时时间（毫秒，默认 30 秒） */
  timeout?: number;

  /** 是否跳过失败继续执行（默认 true） */
  continueOnError?: boolean;

  /** 自定义优先级列表（覆盖默认配置） */
  priorities?: WarmupPriority[];

  /** 热表数量（覆盖默认配置） */
  hotTableCount?: number;

  /** 热查询数量（覆盖默认配置） */
  hotQueryCount?: number;
}

/**
 * 预热结果
 */
export interface WarmupResult {
  /** 是否成功 */
  success: boolean;

  /** 触发器 */
  trigger: WarmupTrigger;

  /** 执行的策略列表 */
  executedStrategies: Array<{
    priority: WarmupPriority;
    success: boolean;
    duration: number;
    itemsWarmed: number;
    error?: string;
  }>;

  /** 总耗时（毫秒） */
  totalDuration: number;

  /** 总预热项数 */
  totalItemsWarmed: number;

  /** 错误信息 */
  errors: string[];
}

/**
 * 创建默认预热选项
 *
 * @param trigger - 触发器类型
 * @returns 预热选项
 */
export function createDefaultWarmupOptions(trigger: WarmupTrigger): WarmupOptions {
  return {
    trigger,
    parallel: false,
    timeout: 30000, // 30 秒
    continueOnError: true,
    priorities: undefined,
    hotTableCount: 50,
    hotQueryCount: 20,
  };
}
