/**
 * DI 容器核心实现
 * 基于 tsyringe 的依赖注入容器配置
 */

import 'reflect-metadata';
import { container as tsyringeContainer, DependencyContainer } from 'tsyringe';
import { PrismaClient } from '@/app/generated/prisma';
import { DI_TOKENS } from './tokens';
import type { ContainerConfig } from './types';

/**
 * 全局 DI 容器实例
 */
let globalContainer: DependencyContainer | null = null;

/**
 * 获取全局 DI 容器
 */
export function getContainer(): DependencyContainer {
  if (!globalContainer) {
    globalContainer = createContainer();
  }
  return globalContainer;
}

/**
 * 创建新的 DI 容器
 */
export function createContainer(config?: ContainerConfig): DependencyContainer {
  const newContainer = tsyringeContainer.createChildContainer();

  if (config?.debug) {
    console.log('[DI Container] Creating new container with config:', config);
  }

  return newContainer;
}

/**
 * 注册核心服务
 */
export function registerCoreServices(container: DependencyContainer): void {
  // 动态导入工厂以避免循环依赖
  const { createPrismaClient } = require('./factories/prisma.factory');

  // 注册 PrismaClient 单例
  container.register(DI_TOKENS.PrismaClient, {
    useFactory: () => createPrismaClient(),
  });

  console.log('[DI Container] Core services registered');
}

/**
 * 重置容器（主要用于测试）
 */
export function resetContainer(): void {
  globalContainer = null;
  tsyringeContainer.clearInstances();
  console.log('[DI Container] Container reset');
}

/**
 * 初始化 DI 容器
 */
export function initializeContainer(config?: ContainerConfig): DependencyContainer {
  if (globalContainer) {
    console.warn('[DI Container] Container already initialized, returning existing instance');
    return globalContainer;
  }

  globalContainer = createContainer(config);
  registerCoreServices(globalContainer);

  if (config?.debug) {
    console.log('[DI Container] Container initialized successfully');
  }

  return globalContainer;
}

/**
 * 从容器中解析服务
 */
export function resolve<T>(token: symbol): T {
  const container = getContainer();
  return container.resolve<T>(token);
}

/**
 * 检查服务是否已注册
 */
export function isRegistered(token: symbol): boolean {
  const container = getContainer();
  return container.isRegistered(token);
}

/**
 * 注册单例服务
 */
export function registerSingleton<T>(
  token: symbol,
  useClass?: new (...args: any[]) => T,
  useFactory?: () => T
): void {
  const container = getContainer();

  if (useFactory) {
    container.register(token, { useFactory });
  } else if (useClass) {
    container.registerSingleton(token, useClass);
  } else {
    throw new Error('Either useClass or useFactory must be provided');
  }
}

/**
 * 注册瞬态服务
 */
export function registerTransient<T>(
  token: symbol,
  useClass: new (...args: any[]) => T
): void {
  const container = getContainer();
  container.register(token, useClass);
}

/**
 * 注册值
 */
export function registerValue<T>(token: symbol, value: T): void {
  const container = getContainer();
  container.register(token, { useValue: value });
}
