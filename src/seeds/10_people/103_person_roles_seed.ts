import { Seeder } from "../seed-runner";

export const seedPersonRoles: Seeder = {
    name: '10_people:person_roles',
    run: async (ds) => {
        await ds
            .createQueryBuilder()
            .insert()
            .into('person_roles')
            .values([
                {
                    ci_person: '9315951',
                    id_role: 1,
                    id_faculty: null, // Es el admin general
                }
            ])
            .orIgnore()
            .execute();
    }
};
