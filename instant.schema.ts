// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "@instantdb/react";

const _schema = i.schema({
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
    "customers": i.entity({
      "name": i.any().optional(),
      "phone": i.string().unique().indexed().optional(),
    }),
    "messages": i.entity({
      "body": i.any().optional(),
      "createdAt": i.any().optional(),
      "direction": i.any().optional(),
      "from": i.any().optional(),
      "sid": i.string().unique().indexed().optional(),
      "to": i.any().optional(),
    }),
    "offices": i.entity({
      "fullName": i.any().optional(),
      "name": i.any().optional(),
    }),
    "orderFrom": i.entity({
      "description": i.any().optional(),
      "placeId": i.any().optional(),
    }),
    "orderItems": i.entity({
      "consoles": i.any().optional(),
      "laptops": i.any().optional(),
      "largeBarrels": i.any().optional(),
      "phones": i.any().optional(),
      "smallBarrels": i.any().optional(),
      "tablets": i.any().optional(),
    }),
    "orders": i.entity({
      "amountPaid": i.any().optional(),
      "amountTotal": i.any().optional(),
      "clearance": i.any().optional(),
      "createdAt": i.any().optional(),
    }),
    "orderTo": i.entity({
      "description": i.any().optional(),
      "placeId": i.any().optional(),
    }),
    "packages": i.entity({
      "height": i.any().optional(),
      "length": i.any().optional(),
      "number": i.any().optional(),
      "quantity": i.any().optional(),
      "weight": i.any().optional(),
      "width": i.any().optional(),
    }),
    "shipments": i.entity({
      "createdAt": i.any().optional(),
      "title": i.any().optional(),
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
    "customersOrders": {
      "forward": {
        "on": "customers",
        "has": "many",
        "label": "orders"
      },
      "reverse": {
        "on": "orders",
        "has": "one",
        "label": "customers",
        "onDelete": "cascade"
      }
    },
    "messagesCustomers": {
      "forward": {
        "on": "messages",
        "has": "one",
        "label": "customers"
      },
      "reverse": {
        "on": "customers",
        "has": "many",
        "label": "messages"
      }
    },
    "orderFromOrders": {
      "forward": {
        "on": "orderFrom",
        "has": "one",
        "label": "orders",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "orders",
        "has": "one",
        "label": "orderFrom"
      }
    },
    "ordersOrderItems": {
      "forward": {
        "on": "orders",
        "has": "one",
        "label": "orderItems"
      },
      "reverse": {
        "on": "orderItems",
        "has": "one",
        "label": "orders",
        "onDelete": "cascade"
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
    "orderToOrders": {
      "forward": {
        "on": "orderTo",
        "has": "one",
        "label": "orders",
        "onDelete": "cascade"
      },
      "reverse": {
        "on": "orders",
        "has": "one",
        "label": "orderTo"
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
    }
  },
  rooms: {}
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema }
export default schema;
