import { defineConfig } from "tinacms";

const branch = process.env.GITHUB_BRANCH || 
               process.env.VERCEL_GIT_COMMIT_REF || 
               process.env.HEAD || 
               "main";

export default defineConfig({
  branch,
  clientId: process.env.TINA_CLIENT_ID || "7a1aca6c-11e2-41eb-8c59-de0b3e648ecb",
  token: process.env.TINA_TOKEN || "693c7cd11d485cf9abea802de256cf79b70fe95d",

  build: {
    outputFolder: "admin",
    publicFolder: ".",
  },

  media: {
    tina: {
      mediaRoot: "images/portfolio",
      publicFolder: ".",
    },
  },

  schema: {
    collections: [
      {
        name: "portfolio",
        label: "Portfólio",
        path: "content/portfolio",
        format: "json",
        fields: [
          {
            type: "string",
            name: "title",
            label: "Título do Projeto",
            required: true,
          },
          {
            type: "string",
            name: "category",
            label: "Categoria",
            required: true,
            options: [
              "Casamentos",
              "Aniversários",
              "Corporativo",
              "Shows",
              "Drone",
              "Batizados",
              "Chá Revelação",
              "Ensaios",
              "Eventos Esportivos",
              "Outros",
            ],
          },
          {
            type: "image",
            name: "thumbnail",
            label: "Imagem de Capa",
            required: true,
          },
          {
            type: "object",
            name: "gallery",
            label: "Galeria de Fotos",
            list: true,
            fields: [
              {
                type: "image",
                name: "image",
                label: "Imagem",
              },
              {
                type: "string",
                name: "caption",
                label: "Legenda",
              },
            ],
          },
          {
            type: "string",
            name: "description",
            label: "Descrição",
            ui: {
              component: "textarea",
            },
          },
          {
            type: "datetime",
            name: "date",
            label: "Data do Evento",
          },
          {
            type: "string",
            name: "instagramUrl",
            label: "Link do Instagram",
          },
        ],
      },
    ],
  },
});