-- D246: the emergency maintenance switch (one row).
CREATE TABLE "MaintenanceMode" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "message" VARCHAR(200),
    "enabledAt" TIMESTAMPTZ(3),
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaintenanceMode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MaintenanceMode_single_row" CHECK ("id" = 1)
);

INSERT INTO "MaintenanceMode" ("id", "enabled") VALUES (1, false);
