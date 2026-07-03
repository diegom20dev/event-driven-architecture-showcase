import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1782963868753 implements MigrationInterface {
  name = 'InitialSchema1782963868753';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."matches_status_enum" AS ENUM('CREATED', 'WAITING_PLAYERS', 'IN_PROGRESS', 'FINISHED', 'CANCELLED')`,
    );
    await queryRunner.query(
      `CREATE TABLE "matches" ("id" uuid NOT NULL, "status" "public"."matches_status_enum" NOT NULL, "players" jsonb NOT NULL DEFAULT '[]', "winner_id" uuid, "version" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_8a22c7b2e0828988d51256117f4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "moves" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "match_id" uuid NOT NULL, "client_move_id" uuid NOT NULL, "payload" jsonb NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'PENDING', "result" jsonb, "version" integer NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_moves_match_client" UNIQUE ("match_id", "client_move_id"), CONSTRAINT "PK_fcbf4e07f988d7d37d00e933133" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "moves" ADD CONSTRAINT "FK_138edd095f20a14f12c8a11760a" FOREIGN KEY ("match_id") REFERENCES "matches"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "moves" DROP CONSTRAINT "FK_138edd095f20a14f12c8a11760a"`);
    await queryRunner.query(`DROP TABLE "moves"`);
    await queryRunner.query(`DROP TABLE "matches"`);
    await queryRunner.query(`DROP TYPE "public"."matches_status_enum"`);
  }
}
