import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PersonaStrategy } from './persona-strategy.interface';
import { DefaultPersonaStrategy } from './strategies/default.strategy';
import { ReactivePersonaStrategy } from './strategies/reactive.strategy';

@Injectable()
export class PersonaStrategyRegistry implements OnModuleInit {
  private readonly logger = new Logger(PersonaStrategyRegistry.name);
  private readonly strategies = new Map<string, PersonaStrategy>();

  onModuleInit(): void {
    this.register(new DefaultPersonaStrategy());
    this.register(new ReactivePersonaStrategy());
  }

  register(strategy: PersonaStrategy): void {
    this.strategies.set(strategy.type, strategy);
    this.logger.log(`Registered persona strategy: ${strategy.type}`);
  }

  get(type: string): PersonaStrategy | undefined {
    return this.strategies.get(type);
  }

  getOrThrow(type: string): PersonaStrategy {
    const strategy = this.strategies.get(type);
    if (!strategy) {
      throw new Error(
        `No persona strategy registered for type "${type}". Available: ${this.listTypes().join(', ')}`,
      );
    }
    return strategy;
  }

  list(): PersonaStrategy[] {
    return Array.from(this.strategies.values());
  }

  listTypes(): string[] {
    return Array.from(this.strategies.keys());
  }

  has(type: string): boolean {
    return this.strategies.has(type);
  }
}
