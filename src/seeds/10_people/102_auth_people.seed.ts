import { Seeder } from "../seed-runner";
import * as argon2 from 'argon2';

export const seedAuthPeople: Seeder = {
    name: '10_people:auth_people',
    run: async (ds) => {
        const email = 'josueperezv2004@gmail.com'.trim().toLowerCase();
        const password = 'Secreta123';

        // Verificamos si ya existe un auth con ese mail
        const existing: Array<{ 1: number }> = await ds.query(
            `SELECT 1 
            FROM auth_people
            WHERE lower(email) = lower($1)
            LIMIT 1`,
            [email],
        );

        if (existing.length > 0) {
            return;
        }

        const hash = await argon2.hash(password);

        await ds
            .createQueryBuilder()
            .insert()
            .into('auth_people')
            .values([
                {
                    id_person: '9315951',
                    email: email,
                    password_hash: hash,
                    password_algo: 'argon2',
                    is_active: true,
                    is_locked: false,
                    failed_attempts: 0,
                }
            ])
            .orIgnore()
            .execute();
    },
};