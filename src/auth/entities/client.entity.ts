import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('clients')
@Index(['email'], { unique: true })
export class Client {
  @PrimaryColumn('uuid')
  client_id!: string;

  @Column('varchar')
  first_name!: string;

  @Column('varchar', { nullable: true })
  middle_name?: string;

  @Column('varchar')
  last_name!: string;

  @Column('varchar', { unique: true })
  email!: string;

  @Column('varchar')
  password_hash!: string;

  @Column('date')
  date_of_birth!: Date;

  @CreateDateColumn()
  join_date!: Date;

  @Column('char', { length: 4, nullable: true })
  ssn_last4?: string;

  @Column('varchar', { nullable: true })
  portfolio_size_range?: string;

  @Column('varchar', { nullable: true })
  risk_tolerance?: string;

  @Column('varchar', { nullable: true })
  phone?: string;

  @Column('char', { length: 2, nullable: true })
  country?: string;

  @Column('boolean', { default: false })
  email_verified!: boolean;

  @Column('varchar', { default: 'ACTIVE' })
  auth_status!: string;

  @Column('integer', { default: 0 })
  failed_login_attempts!: number;

  @Column('timestamp', { nullable: true })
  locked_until?: Date;

  @Column('inet', { nullable: true })
  signup_ip?: string;

  @Column('varchar', { nullable: true })
  signup_device?: string;
}
