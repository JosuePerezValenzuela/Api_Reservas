import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

export default new DataSource({
    type: 'postgres',
    host: process.env.POSTGRES_HOST?.trim(),
    port: process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432,
    username: process.env.POSTGRES_USER?.trim(),
    password: process.env.POSTGRES_PASSWORD?.trim(),
    database: process.env.POSTGRES_DB?.trim(),
    entities: [], // ← vacío si usarás SQL crudo en migraciones
    migrationsRun: false,
    migrations: ['src/migrations/*.ts'],
    synchronize: false, // siempre con migraciones
});
