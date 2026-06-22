CREATE TABLE "catalog_items" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"image_url" varchar(512),
	"price_cents" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'payment_pending';
--> statement-breakpoint
UPDATE "orders" SET "status" = CASE "status"
	WHEN 'pending' THEN 'payment_pending'
	WHEN 'paid' THEN 'placed'
	WHEN 'failed' THEN 'payment_failed'
	WHEN 'cancelled' THEN 'payment_failed'
	ELSE "status"
END;
--> statement-breakpoint
DROP TYPE "public"."order_status";
--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('payment_pending', 'payment_failed', 'placed', 'preparing', 'ready', 'seat-delivered');
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'payment_pending'::"public"."order_status";
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_status" USING "status"::"public"."order_status";
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "seat_number" varchar(16);
--> statement-breakpoint
UPDATE "orders" SET "seat_number" = 'unknown' WHERE "seat_number" IS NULL;
--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "seat_number" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "inventory_sql" ADD CONSTRAINT "inventory_sql_item_id_catalog_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."catalog_items"("id") ON DELETE cascade ON UPDATE no action;
