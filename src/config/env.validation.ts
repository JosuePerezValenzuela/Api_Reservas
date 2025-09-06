import * as Joi from 'joi';

export const envSchema = Joi.object({
    // Modo de la app
    NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),

    // Servidor HTTP
    APP_PORT: Joi.number().port().default(3000),

    // PostgreSQL (requerido: todos)
    POSTGRES_HOST: Joi.string().required(), // ej: 'localhost' o IP/DNS
    POSTGRES_PORT: Joi.number().port().required(), // ej: 5432
    POSTGRES_USER: Joi.string().required(), // ej: 'postgres'
    POSTGRES_PASSWORD: Joi.string().min(1).required(),
    POSTGRES_DB: Joi.string().required(), // ej: 'Reservas_Nuevo'

    // JWT (auth)
    JWT_ACCESS_SECRET: Joi.string().min(32).required(), // 32+ recomendado
    JWT_REFRESH_SECRET: Joi.string().min(32).required(),
    JWT_ACCESS_TTL: Joi.string().default('900s'), // '900s' | '15m' | etc.
    JWT_REFRESH_TTL: Joi.string().default('30d'),
    RESET_TOKEN_TTL: Joi.string().default('30m'),

    // Zona horaria del proceso
    TZ: Joi.string().default('America/La_Paz'),
})
    // permite variables extra que no validamos explícitamente (por si añades algo luego)
    .unknown(true);
