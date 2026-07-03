import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Construye las opciones de conexión a Postgres a partir de variables de entorno.
 *
 * El schema se gestiona con migraciones de TypeORM (`npm run migration:run`), que
 * corren automáticamente al arrancar (`migrationsRun`). `synchronize` queda apagado
 * por defecto; se puede reactivar con `DB_SYNCHRONIZE=true` solo para prototipado local.
 */
export function buildTypeOrmOptions(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.get<string>('DB_HOST', 'localhost'),
    port: config.get<number>('DB_PORT', 5432),
    username: config.get<string>('DB_USERNAME', 'match'),
    password: config.get<string>('DB_PASSWORD', 'match'),
    database: config.get<string>('DB_NAME', 'match_engine'),
    autoLoadEntities: true,
    synchronize: config.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
    migrations: [__dirname + '/../migrations/*{.ts,.js}'],
    migrationsRun: config.get<string>('DB_MIGRATIONS_RUN', 'true') === 'true',
  };
}
