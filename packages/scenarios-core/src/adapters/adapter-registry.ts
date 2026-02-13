import { Injectable, Logger } from '@nestjs/common';
import { AgentAdapter } from './agent-adapter.interface';

@Injectable()
export class AdapterRegistry {
  private readonly logger = new Logger(AdapterRegistry.name);
  private readonly adapters = new Map<string, AgentAdapter>();

  register(adapter: AgentAdapter): void {
    this.adapters.set(adapter.type, adapter);
    this.logger.log(`Registered adapter: ${adapter.type} (${adapter.name})`);
  }

  get(type: string): AgentAdapter | undefined {
    return this.adapters.get(type);
  }

  getOrThrow(type: string): AgentAdapter {
    const adapter = this.adapters.get(type);
    if (!adapter) {
      throw new Error(
        `No adapter registered for type "${type}". Available: ${this.listTypes().join(', ')}`,
      );
    }
    return adapter;
  }

  list(): AgentAdapter[] {
    return Array.from(this.adapters.values());
  }

  listTypes(): string[] {
    return Array.from(this.adapters.keys());
  }

  has(type: string): boolean {
    return this.adapters.has(type);
  }
}
