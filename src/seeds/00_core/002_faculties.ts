import { Seeder } from "../seed-runner";

export const seedFaculties: Seeder = {
    name: '00_core:faculties',
    run: async (ds) => {
        // Inserto si no existen
        await ds
            .createQueryBuilder()
            .insert()
            .into('faculties')
            .values([
                { faculties_name: 'FCyT', active: true },
                { faculties_name: 'FCE', active: true },
            ])
            .orIgnore()
            .execute();
    },
};
