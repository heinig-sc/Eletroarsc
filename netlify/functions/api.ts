import serverless from "serverless-http";
import { createServer } from "../../server";

let serverlessApp: any;

export const handler = async (event: any, context: any) => {
  if (!serverlessApp) {
    const app = await createServer();
    serverlessApp = serverless(app);
  }
  
  // Netlify functions don't handle /api prefix well if redirected
  // But our redirects in netlify.toml handle it.
  return serverlessApp(event, context);
};
