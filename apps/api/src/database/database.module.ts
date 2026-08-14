import { Global, Module } from "@nestjs/common";
import { DatabaseInitService } from "./database-init.service.js";
import { DatabaseService } from "./database.service.js";

@Global()
@Module({
  providers: [DatabaseInitService, DatabaseService],
  exports: [DatabaseInitService, DatabaseService],
})
export class DatabaseModule {}
