
export function makeSpan(traceId, name, attributes = {}, parentId = null) {
  return {
    time: new Date().toISOString(),
    name,
    trace: traceId,
    span_id: crypto.randomUUID().replace(/-/g, "").slice(0, 16), // unique span id
    parent_id: parentId,
    attributes: { ...attributes },
  };
}

export async function sendSpanToHoneycomb(env, span) {
  const HONEYCOMB_API_KEY = "hcaik_01k932r56fmgq8gtw441g5htz24mj2ngzff4kw6gshzs8dz05n77k31fak";
  const HONEYCOMB_DATASET = "mytest";

  // ✅ Map our span to Honeycomb event structure
  const event = {
    time: span.time,
    data: {
      "trace.trace_id": span.trace,
      "trace.span_id": span.span_id,
      ...(span.parent_id ? { "trace.parent_id": span.parent_id } : {}),
      "name": span.name,
      ...span.attributes,
    },
  };

  console.log("Sending event to Honeycomb:", JSON.stringify(event, null, 2));

//   console.log("Sending span to Honeycomb:", JSON.stringify(payload, null, 2));

  try {
    const res = await fetch(`https://api.honeycomb.io/1/batch/${HONEYCOMB_DATASET}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Honeycomb-Team": HONEYCOMB_API_KEY,
      },
      body: JSON.stringify([event]),
    });

    console.log("Honeycomb response status:", res.status);
    if (!res.ok) console.error("Error response:", await res.text());
  } catch (err) {
    console.error("Honeycomb send failed", err);
  }
}


// export function makeSpan(traceId, name, attributes = {}) {
//   return {
//     time: new Date().toISOString(),
//     data: {
//       "trace.trace_id": traceId,
//       "name": name,
//       ...attributes,
//     },
//   };
// }

// export async function sendSpanToHoneycomb(env, span) {
//   const HONEYCOMB_API_KEY = "hcaik_01k932r56fmgq8gtw441g5htz24mj2ngzff4kw6gshzs8dz05n77k31fak";
//   const HONEYCOMB_DATASET = "mytest";

//   const payload = [span];
//     console.log("Prepared payload for Honeycomb:", JSON.stringify(span, null, 2));
// //   console.log("Sending span to Honeycomb:", JSON.stringify(payload, null, 2));

//   try {
//     const res = await fetch(`https://api.honeycomb.io/1/batch/${HONEYCOMB_DATASET}`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//         "X-Honeycomb-Team": HONEYCOMB_API_KEY,
//       },
//       body: JSON.stringify(payload),
//     });

//     console.log("Honeycomb response status:", res.status);
//     if (!res.ok) console.error("Error response:", await res.text());
//   } catch (err) {
//     console.error("Honeycomb send failed", err);
//   }
// }

