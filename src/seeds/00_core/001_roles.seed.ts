import { Seeder } from "../seed-runner";

export const seedRoles: Seeder = {
    name: '00_core:roles',
    run: async (ds) => {
        // Inserto si no existen
        await ds
            .createQueryBuilder()
            .insert()
            .into('roles', ['role_name'])
            .values([
                { roles_name: 'COORDINADOR_GENERAL'},
                { roles_name: 'COORDINADOR'},
                { roles_name: 'DOCENTE'},
            ])
            .orIgnore()
            .execute();
    },
};