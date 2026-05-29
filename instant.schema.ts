// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/admin";

const _schema = i.schema({
  // We inferred 12 attributes!
  // Take a look at this schema, and if everything looks good,
  // run `push schema` again to enforce the types.
  entities: {
    "$files": i.entity({
      "path": i.string().unique().indexed(),
      "url": i.string().optional(),
    }),
    "$users": i.entity({
      "email": i.string().unique().indexed().optional(),
      "imageURL": i.string().optional(),
      "phone": i.string().optional(),
      "type": i.string().optional(),
    }),
    "activities": i.entity({}),
    "chats": i.entity({
      "messages": i.any().optional(),
    }),
    "devices": i.entity({}),
    "offices": i.entity({
      "fullName": i.string().optional(),
      "name": i.string().optional(),
    }),
    "orders": i.entity({
      "amountPaid": i.number().optional(),
      "amountTotal": i.number().optional(),
      "consoles": i.any().optional(),
      "createdAt": i.any().optional(),
      "from": i.string().optional(),
      "laptops": i.any().optional(),
      "largeBarrels": i.any().optional(),
      "phones": i.any().optional(),
      "smallBarrels": i.any().optional(),
      "tablets": i.any().optional(),
      "tags": i.any().optional(),
      "to": i.string().optional(),
    }),
    "packages": i.entity({
      "height": i.number().optional(),
      "length": i.number().optional(),
      "quantity": i.number().optional(),
      "weight": i.number().optional(),
      "width": i.number().optional(),
    }),
    "shipments": i.entity({}),
    "users": i.entity({
      "email": i.string().optional(),
      "phone": i.string().optional(),
    }),
  },
  links: {
    "$usersLinkedPrimaryUser": {
      "forward": {
        "on": "$users",
        "has": "one",
        "label": "linkedPrimaryUser",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "$users",
        "has": "many",
        "label": "linkedGuestUsers"
      }
    },
    "activitiesUsers": {
      "forward": {
        "on": "activities",
        "has": "one",
        "label": "users",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "users",
        "has": "many",
        "label": "activities"
      }
    },
    "chatsUsers": {
      "forward": {
        "on": "chats",
        "has": "one",
        "label": "users",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "users",
        "has": "many",
        "label": "chats"
      }
    },
    "ordersAssignees": {
      "forward": {
        "on": "orders",
        "has": "many",
        "label": "assignees"
      },
      "reverse": {
        "on": "users",
        "has": "many",
        "label": "assigned"
      }
    },
    "ordersShipments": {
      "forward": {
        "on": "orders",
        "has": "one",
        "label": "shipments",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "shipments",
        "has": "many",
        "label": "orders"
      }
    },
    "packagesOrders": {
      "forward": {
        "on": "packages",
        "has": "one",
        "label": "orders",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "orders",
        "has": "many",
        "label": "packages"
      }
    },
    "usersDevices": {
      "forward": {
        "on": "users",
        "has": "many",
        "label": "devices"
      },
      "reverse": {
        "on": "devices",
        "has": "one",
        "label": "users",
        "onDelete": "cascade"
      }
    },
    "usersOffices": {
      "forward": {
        "on": "users",
        "has": "one",
        "label": "offices"
      },
      "reverse": {
        "on": "offices",
        "has": "many",
        "label": "users"
      }
    },
    "usersOrders": {
      "forward": {
        "on": "users",
        "has": "many",
        "label": "orders"
      },
      "reverse": {
        "on": "orders",
        "has": "one",
        "label": "users",
        "onDelete": "cascade"
      }
    }
  },
  rooms: {}
});

// This helps Typescript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema }
export default schema;
