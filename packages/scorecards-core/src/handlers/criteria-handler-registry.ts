import { Injectable, Logger } from '@nestjs/common';
import { CriteriaHandler } from './criteria-handler.interface';

@Injectable()
export class CriteriaHandlerRegistry {
  private readonly logger = new Logger(CriteriaHandlerRegistry.name);
  private readonly handlers = new Map<string, CriteriaHandler>();

  register(handler: CriteriaHandler): void {
    this.handlers.set(handler.type, handler);
    this.logger.log(`Registered criteria handler: ${handler.type}`);
  }

  get(type: string): CriteriaHandler | undefined {
    return this.handlers.get(type);
  }

  getOrThrow(type: string): CriteriaHandler {
    const handler = this.handlers.get(type);
    if (!handler) {
      throw new Error(
        `No criteria handler registered for type: ${type}. Available: ${this.listTypes().join(', ')}`,
      );
    }
    return handler;
  }

  has(type: string): boolean {
    return this.handlers.has(type);
  }

  list(): CriteriaHandler[] {
    return Array.from(this.handlers.values());
  }

  listTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
}
