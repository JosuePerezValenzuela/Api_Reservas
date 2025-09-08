import { Seeder } from '../seed-runner';

export const seedPeople: Seeder = {
    name: '10_people:people',
    run: async (ds) => {
        await ds
            .createQueryBuilder()
            .insert()
            .into('people')
            .values([
                { ci_person: '9315951',
                  person_name: 'Josue Perez Valenzuela',
                  person_mail: 'josueperezv2004@gmail.com',
                  is_active: true,   
                }
            ])
            .orIgnore()
            .execute();
    },
};