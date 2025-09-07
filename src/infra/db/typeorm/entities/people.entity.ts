import { Column, Entity, OneToOne, PrimaryColumn } from "typeorm";
import { AuthPeople } from "./auth-people.entity";

@Entity({ name: 'people' })
export class People {
    @PrimaryColumn({ name: 'ci_person', type: "varchar", length: 15 })
    ciperson!: string;

    @Column({ name: "person_name", type: "varchar", length: 50 })
    personname!: string;

    @Column({ name: "person_mail", type: "varchar", length: 254 })
    personmail!: string;

    @Column({ name: "person_phone", type: "varchar", length: 8, nullable: true })
    personphone?: string | null;
    
    @Column({ name: 'is_active', type: 'boolean', default: true })
    isactive!: boolean;

    @OneToOne(() => AuthPeople, (a) => a.person)
    auth?: AuthPeople;
}