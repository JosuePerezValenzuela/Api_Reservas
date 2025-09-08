/* eslint-disable no-console */
import 'reflect-metadata';
import dataSource from '../../ormconfig';

export interface Seeder {
    name: string;
    run: (ds: typeof dataSource) => Promise<void>;
}

// Importaicon de los seeders