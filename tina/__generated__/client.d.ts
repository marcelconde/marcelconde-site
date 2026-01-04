import { createClient } from "tinacms/dist/client";
import { queries } from "./types";
export const client = createClient({ url: 'http://localhost:4001/graphql', token: '094647ade8dec0d339c92b386583ac594fe21ab9', queries,  });
export default client;
  