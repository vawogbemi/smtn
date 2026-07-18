import {
  init,
  id,
  lookup
} from "@instantdb/react";
import schema from "./instant.schema";

export const db = init({ appId: "7b35af25-09c0-4433-a004-c9d566cc8bb4", schema, useDateObjects: true  });

export { id, lookup };