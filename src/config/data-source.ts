import 'reflect-metadata';
import { DataSource } from 'typeorm';

/**
 * DataSource standalone para la CLI de TypeORM (migration:generate/run/revert).
 *
 * El app NestJS usa `buildTypeOrmOptions()`; este archivo existe SOLO para la CLI,
 * que necesita un DataSource exportado por defecto. Lee las mismas variables de
 * entorno que el app (con los mismos defaults) para apuntar a la misma DB.
 */
export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'match',
  password: process.env.DB_PASSWORD ?? 'match',
  database: process.env.DB_NAME ?? 'match_engine',
  entities: [__dirname + '/../**/*.orm-entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
});
