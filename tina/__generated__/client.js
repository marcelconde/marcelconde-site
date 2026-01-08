import { createClient } from "tinacms/dist/client";
import { queries } from "./types";
export const client = createClient({ url: "http://localhost:4001/graphql", token: "693c7cd11d485cf9abea802de256cf79b70fe95d", queries });
export default client;
