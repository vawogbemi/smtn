/** @jsxImportSource https://esm.sh/react@18.2.0 */
import { Cerebras } from "https://esm.sh/@cerebras/cerebras_cloud_sdk";
import { renderToString } from "https://esm.sh/react-dom@18.2.0/server";
import { useState } from "https://esm.sh/react@18.2.0";
import { email } from "https://esm.town/v/std/email";
import { id, init, tx } from "npm:@instantdb/admin";

const BoxesTable = ({ boxes }) => {
  if (!boxes || boxes.length === 0) return <></>;
  return (
    <table style={{ border: "1px solid black", borderCollapse: "collapse", marginBottom: "20px" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid black", padding: "5px" }}>Height</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Length</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Number</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Weight</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Width</th>
        </tr>
      </thead>
      <tbody>
        {boxes.map((box, index) => (
          <tr key={index}>
            <td style={{ border: "1px solid black", padding: "5px" }}>{box.height}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{box.length}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{box.number}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{box.weight}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{box.width}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ReferencesTable = ({ references }) => {
  if (!references || references.length === 0) return <></>;
  return (
    <table style={{ border: "1px solid black", borderCollapse: "collapse", marginBottom: "20px" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid black", padding: "5px" }}>Cost</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Created At</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Delivery City</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Delivery Location</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Description</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Dropoff City</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Dropoff Location</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Game Consoles</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Height</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Laptops</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Length</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Paid</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Phones</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Received</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Selected Option</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Tablets</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Weight</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Width</th>
        </tr>
      </thead>
      <tbody>
        {references.map((reference, index) => (
          <tr key={index}>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.cost}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.createdAt}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.deliveryCity}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.deliveryLocation}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.description}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.dropoffCity}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.dropoffLocation}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.gameConsoles}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.height}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.laptops}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.length}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.paid ? "Yes" : "No"}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.phones}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.received}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.selectedOption}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.tablets}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.weight}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{reference.width}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const ShipmentsTable = ({ shipments }) => {
  if (!shipments || shipments.length === 0) return <></>;
  return (
    <table style={{ border: "1px solid black", borderCollapse: "collapse", marginBottom: "20px" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid black", padding: "5px" }}>Boxes</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Created At</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>From</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Status</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>To</th>
        </tr>
      </thead>
      <tbody>
        {shipments.map((shipment, index) => (
          <tr key={index}>
            <td style={{ border: "1px solid black", padding: "5px" }}>{shipment.boxes}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{shipment.createdAt}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{shipment.from}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{shipment.status}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{shipment.to}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const UsersTable = ({ users }) => {
  if (!users || users.length === 0) return <></>;
  return (
    <table style={{ border: "1px solid black", borderCollapse: "collapse", marginBottom: "20px" }}>
      <thead>
        <tr>
          <th style={{ border: "1px solid black", padding: "5px" }}>Address</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Email</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>First Name</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Last Name</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Name</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Phone</th>
          <th style={{ border: "1px solid black", padding: "5px" }}>Referrer</th>
        </tr>
      </thead>
      <tbody>
        {users.map((user, index) => (
          <tr key={index}>
            <td style={{ border: "1px solid black", padding: "5px" }}>{user.address}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{user.email}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{user.firstName}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{user.lastName}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{user.name}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{user.phone}</td>
            <td style={{ border: "1px solid black", padding: "5px" }}>{user.referrer}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

function Table({ data }) {
  return (
    <>
      <BoxesTable
        boxes={data.boxes}
      />
      <br />
      <ReferencesTable
        references={data.references}
      />
      <br />
      <ShipmentsTable
        shipments={data.shipments}
      />
      <br />
      <UsersTable
        users={data.users}
      />
    </>
  );
}

export default async function(e: Email) {
  if (!Deno.env.get("INSTANTDB_ADMIN_TOKEN")) {
    throw new Error("INSTANTDB_ADMIN_TOKEN not set");
  }

  if (!Deno.env.get("INSTANTDB_APP_ID")) {
    throw new Error("INSTANTDB_APP_ID not set");
  }

  if (e.subject && e.subject.startsWith("Re:")) {
    return await email({
      to: e.from,
      from: e.to,
      subject: e.subject,
      text: "I'm sorry, I can only reply to new email threads.",
    });
  }

  try {
    const client = new Cerebras({
      apiKey: Deno.env.get("CEREBRAS_API_KEY"),
    });

    const systemPrompt = `
    You are a helpful email assistant helping employees. The company uses an instantdb database. When the employees ask for info you will provide it for 
    them by creating an instantdb query for the server to query the database. Return the query param json string only -- the json object that query is assigned to. Note that the results
    be rendered into 2 tables, one for goals and one for todos, so and associations will not be displayed, instead you should create a query that uses both tables.
   
    --------------------------------------------------------------------------
    Here is an example instantdb query (the examples use an unrelated database):
    
    Fetch namespace
    One of the simplest queries you can write is to simply get all entities of a namespace:
    const query = { goals: {} };
  
    Fetch multiple namespaces
    You can fetch multiple namespaces at once:
    const query = { goals: {}, todos: {} };
  
    console.log(data)
    {
      "goals": [
        {
          "id": healthId,
          "title": "Get fit!"
        },
        {
          "id": workId,
          "title": "Get promoted!"
        }
      ]
    }
  
    Fetch a specific entity
    If you want to filter entities, you can use the where keyword. Here we fetch a specific goal:
    const query = {
      goals: {
        $: {
          where: {
            id: healthId,
          },
        },
      },
    };
  
    console.log(data)
    {
      "goals": [...],
      "todos": [
        {
          "id": focusId,
          "title": "Code a bunch"
        },
        {
          "id": proteinId,
          "title": "Drink protein"
        },
        ...
      ]
    }
  
    Fetch associations
    We can fetch goals and their related todos:
  
    const query = {
      goals: {
        todos: {},
      },
    };
  
    console.log(data)
    {
      "goals": [
        {
          "id": healthId,
          "title": "Get fit!"
        }
      ]
    }

    Fetch associations for filtered namespace
    We can fetch a specific entity in a namespace as well as it's related associations.

    const query = {
      goals: {
        $: {
          where: {
            id: healthId,
          },
        },
        todos: {},
      },
    };
    const { isLoading, error, data } = db.useQuery(query);

    console.log(data)
    {
      "goals": [
        {
          "id": healthId,
          "title": "Get fit!",
          "todos": [
            {
              "id": proteinId,
              "title": "Drink protein"
            },
            {
              "id": sleepId,
              "title": "Go to bed early"
            },
            {
              "id": workoutId,
              "title": "Go on a run"
            }
          ]
        }
      ]
    }

    Filter namespace by associated values
    We can filter namespaces by their associations

    const query = {
      goals: {
        $: {
          where: {
            'todos.title': 'Code a bunch',
          },
        },
        todos: {},
      },
    };
    const { isLoading, error, data } = db.useQuery(query);

    console.log(data)
    {
      "goals": [
        {
          "id": workId,
          "title": "Get promoted!",
          "todos": [
            {
              "id": focusId,
              "title": "Code a bunch"
            },
            {
              "id": reviewPRsId,
              "title": "Review PRs"
            },
            {
              "id": standupId,
              "title": "Do standup"
            }
          ]
        }
      ]
    }

    Filter associations
    We can also filter associated data.

    const query = {
      goals: {
        todos: {
          $: {
            where: {
              'todos.title': 'Go on a run',
            },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);

    console.log(data)
    {
      "goals": [
        {
          "id": healthId,
          "title": "Get fit!",
          "todos": [
            {
              "id": workoutId,
              "title": "Go on a run"
            }
          ]
        },
        {
          "id": workId,
          "title": "Get promoted!",
          "todos": []
        }
      ]
    }

    Inverse Associations
    Associations are also available in the reverse order.
    const query = {
      todos: {
        goals: {},
      },
    };
    const { isLoading, error, data } = db.useQuery(query);

    console.log(data)
    {
      "todos": [
        {
          "id": focusId,
          "title": "Code a bunch",
          "goals": [
            {
              "id": workId,
              "title": "Get promoted!"
            }
          ]
        },
        ...,
      ]
    }

    And key
    The and key is useful when you want an entity to match multiple conditions. In this case we want to find goals that have both Drink protein and Go on a run todos.:

    const query = {
      goals: {
        $: {
          where: {
            and: [
              { 'todos.title': 'Drink protein' },
              { 'todos.title': 'Go on a run' },
            ],
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    
    console.log(data)
    {
      "goals": [
        {
          "id": healthId,
          "title": "Get fit!"
        }
      ]
    }

    OR
    The where clause supports or queries that will filter entities that match any of the clauses in the provided list:
    
    const query = {
      todos: {
        $: {
          where: {
            or: [{ title: 'Code a bunch' }, { title: 'Review PRs' }],
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    
    console.log(data);
    {
      "todos": [
        {
          "id": focusId,
          "title": "Code a bunch"
        },
        {
          "id": reviewPRsId,
          "title": "Review PRs"
        },
      ]
    }

    $in
    The where clause supports $in queries that will filter entities that match any of the items in the provided list. You can think of this as a shorthand for or on a single key.
    
    const query = {
      todos: {
        $: {
          where: {
            title: { $in: ['Code a bunch', 'Review PRs'] },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    
    console.log(data)
    {
      "todos": [
        {
          "id": focusId,
          "title": "Code a bunch"
        },
        {
          "id": reviewPRsId,
          "title": "Review PRs"
        }
      ]
    }

    Comparison operators
    The where clause supports comparison operators on fields that are indexed and have checked types.

    Operator	Description	JS equivalent
    $gt	greater than	>
    $lt	less than	<
    $gte	greater than or equal to	>=
    $lte	less than or equal to	<=
    
    const query = {
      todos: {
        $: {
          where: {
            timeEstimateHours: { $gt: 24 },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    
    console.log(data);
    {
      "todos": [
        {
          "id": buildShipId,
          "title": "Build a starship prototype",
          "timeEstimateHours": 5000
        }
      ]
    }
    
    Dates can be stored as timestamps (milliseconds since the epoch, e.g. Date.now()) or as ISO 8601 strings (e.g. JSON.stringify(new Date())) and can be queried in the same formats:
    
    const now = '2024-11-26T15:25:00.054Z';
    const query = {
      todos: {
        $: { where: { dueDate: { $lte: now } } },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    
    console.log(data);
    {
      "todos": [
        {
          "id": slsFlightId,
          "title": "Space Launch System maiden flight",
          "dueDate": "2017-01-01T00:00:00Z"
        }
      ]
    }
    
    If you try to use comparison operators on data that isn't indexed and type-checked, you'll get an error:
    
    const query = {
      todos: {
        $: { where: { priority: { $gt: 2 } } },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    
    console.log(error);
    {
      "message": "Validation failed for query",
      "hint": {
        "data-type": "query",
        "errors": [
          {
            "expected?": "indexed?",
            "in": ["priority", "$", "where", "priority"],
            "message": "The \`todos.priority\` attribute must be indexed to use comparison operators."
          }
        ],
        "input": {
          "todos": {
            "$": {
              "where": {
                "priority": {
                  "$gt": 2
                }
              }
            }
          }
        }
      }
    }

    $not
    The where clause supports $not queries that will return entities that don't match the provided value for the field, including entities where the field is null or undefined.
    
    const query = {
      todos: {
        $: {
          where: {
            location: { $not: 'work' },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    console.log(data)
    {
      "todos": [
        {
          "id": cookId,
          "title": "Cook dinner",
          "location": "home"
        },
        {
          "id": readId,
          "title": "Read",
          "location": null
        },
            {
          "id": napId,
          "title": "Take a nap"
        }
      ]
    }
    $isNull
    The where clause supports $isNull queries that will filters entities by whether the field value is either null or undefined.
    
    Set $isNull to true to return entities where where the field is null or undefined.
    
    Set $isNull to false to return entities where the field is not null and not undefined.
    
    const query = {
      todos: {
        $: {
          where: {
            location: { $isNull: false },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    console.log(data)
    {
      "todos": [
        {
          "id": cookId,
          "title": "Cook dinner",
          "location": "home"
        }
      ]
    }
    const query = {
      todos: {
        $: {
          where: {
            location: { $isNull: true },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    console.log(data)
    {
      "todos": [
        {
          "id": readId,
          "title": "Read",
          "location": null
        },
        {
          "id": napId,
          "title": "Take a nap"
        }
      ]
    }
    $like
    The where clause supports $like on fields that are indexed with a checked string type.
    
    $like queries will return entities that match a case sensitive substring of the provided value for the field.
    
    For case insensitive matching use $ilike in place of $like.
    
    Here's how you can do queries like startsWith, endsWith and includes.
    
    Example	Description	JS equivalent
    { $like: "Get%" }	Starts with 'Get'	startsWith
    { $like: "%promoted!" }	Ends with 'promoted!'	endsWith
    { $like: "%fit%" }	Contains 'fit'	includes
    Here's how you can use $like to find all goals that end with the word "promoted!"
    
    // Find all goals that end with the word "promoted!"
    const query = {
      goals: {
        $: {
          where: {
            title: { $like: '%promoted!' },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    console.log(data)
    {
      "goals": [
        {
          "id": workId,
          "title": "Get promoted!",
        }
      ]
    }
    You can use $like in nested queries as well
    
    // Find goals that have todos with the word "standup" in their title
    const query = {
      goals: {
        $: {
          where: {
            'todos.title': { $like: '%standup%' },
          },
        },
      },
    };
    const { isLoading, error, data } = db.useQuery(query);
    Returns
    
    console.log(data)
    {
      "goals": [
        {
          "id": standupId,
          "title": "Perform standup!",
        }
      ]
    }
    ------------------------------------------------
    
    Here is the schema of the instantdb database:
    
    const _schema = i.schema({
    entities: {
      $users: i.entity({
        email: i.string().unique().indexed(),
      }),
      boxes: i.entity({
        height: i.number(),
        length: i.number(),
        number: i.number(),
        weight: i.number(),
        width: i.number(),
      }),
      references: i.entity({
        cost: i.any(),
        createdAt: i.date(),
        deliveryCity: i.string(),
        deliveryLocation: i.string(),
        description: i.string(),
        dropoffCity: i.string(),
        dropoffLocation: i.string(),
        gameConsoles: i.number(),
        height: i.string(),
        laptops: i.number(),
        length: i.string(),
        paid: i.boolean(),
        phones: i.number(),
        received: i.any(),
        selectedOption: i.string(),
        tablets: i.number(),
        weight: i.number(),
        width: i.string(),
      }),
      shipments: i.entity({
        boxes: i.any(),
        createdAt: i.date(),
        from: i.string(),
        status: i.number(),
        to: i.string(),
      }),
      users: i.entity({
        address: i.string(),
        email: i.string().unique().indexed(),
        firstName: i.string(),
        lastName: i.string(),
        name: i.string(),
        phone: i.string().indexed(),
        referrer: i.string(),
      }),
    },
    links: {
      boxesReferences: {
        forward: {
          on: "boxes",
          has: "one",
          label: "references",
        },
        reverse: {
          on: "references",
          has: "many",
          label: "boxes",
        },
      },
      referencesShipments: {
        forward: {
          on: "references",
          has: "one",
          label: "shipments",
        },
        reverse: {
          on: "shipments",
          has: "many",
          label: "references",
        },
      },
      referencesUsers: {
        forward: {
          on: "references",
          has: "one",
          label: "users",
        },
        reverse: {
          on: "users",
          has: "many",
          label: "references",
        },
      },
      users$users: {
        forward: {
          on: "users",
          has: "one",
          label: "$users",
        },
        reverse: {
          on: "$users",
          has: "one",
          label: "users",
        },
      },
    },
  });
  `;

    const completion = await client.chat.completions.create({
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: e.text! }],
      model: "llama3.3-70b",
      response_format: { "type": "json_object" },
    });

    const results = completion.choices[0].message.content;
    console.log(results);

    const db = init({
      appId: "1f28f522-bd85-4e85-9aad-e2f73cd0cf12",
      adminToken: "1fee25f0-c76d-4b93-a7d8-94fa13f05541",
    });

    const query = JSON.parse(results);

    const data = await db.query(query);

    await email({
      to: e.from,
      from: e.to,
      subject: `Re: ${e.subject}`,
      html: renderToString(<Table data={data} />),
    });
  }
  catch (error) {
    await email({
      to: e.from,
      from: "vawogbemi.dara@valtown.email",
      subject: `Re: ${e.subject}`,
      text: error.toString(),
    });
  }
}