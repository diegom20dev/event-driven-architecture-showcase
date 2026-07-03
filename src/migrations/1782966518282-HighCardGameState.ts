import { MigrationInterface, QueryRunner } from "typeorm";

export class HighCardGameState1782966518282 implements MigrationInterface {
    name = 'HighCardGameState1782966518282'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" ADD "expected_players" integer NOT NULL DEFAULT '2'`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "points_to_win" integer NOT NULL DEFAULT '3'`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "round_number" integer NOT NULL DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "choices" jsonb NOT NULL DEFAULT '{}'`);
        await queryRunner.query(`ALTER TABLE "matches" ADD "scores" jsonb NOT NULL DEFAULT '{}'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "scores"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "choices"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "round_number"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "points_to_win"`);
        await queryRunner.query(`ALTER TABLE "matches" DROP COLUMN "expected_players"`);
    }

}
