import { MikroORM } from "@mikro-orm/core";
import { Injectable, Logger, OnModuleInit } from "@nestjs/common";

@Injectable()
export class DatabaseInitService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseInitService.name);
  private initializationPromise: Promise<void> | null = null;

  constructor(private readonly orm: MikroORM) {}

  async onModuleInit(): Promise<void> {
    await this.waitUntilReady();
  }

  async waitUntilReady(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initialize().catch((error: unknown) => {
        this.initializationPromise = null;
        throw error;
      });
    }
    await this.initializationPromise;
  }

  private async initialize(): Promise<void> {
    await this.orm.getMigrator().up();
    this.logger.log("PostgreSQL migrations applied");
  }
}
