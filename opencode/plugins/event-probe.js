export const EventProbe = async ({ client }) => {
  return {
    event: async ({ event }) => {
      await client.app.log({
        body: {
          service: "event-probe",
          level: "info",
          message: `Event: ${event.type} | ${JSON.stringify(event.properties || {})}`,
        },
      })
    },
  }
}
