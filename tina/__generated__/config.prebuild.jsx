// tina/config.js
import { defineConfig } from "tinacms";
var branch = process.env.GITHUB_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || process.env.HEAD || "main";
var config_default = defineConfig({
  branch,
  clientId: process.env.TINA_CLIENT_ID || "84e919a3-c640-4fab-b53e-aedc755e76bb",
  token: process.env.TINA_TOKEN || "094647ade8dec0d339c92b386583ac594fe21ab9",
  build: {
    outputFolder: "admin",
    publicFolder: "."
  },
  media: {
    tina: {
      mediaRoot: "images/portfolio",
      publicFolder: "."
    }
  },
  schema: {
    collections: [
      {
        name: "portfolio",
        label: "Portf\xF3lio",
        path: "content/portfolio",
        format: "json",
        fields: [
          {
            type: "string",
            name: "title",
            label: "T\xEDtulo do Projeto",
            required: true
          },
          {
            type: "string",
            name: "category",
            label: "Categoria",
            required: true,
            options: [
              "Casamentos",
              "Anivers\xE1rios",
              "Corporativo",
              "Shows",
              "Drone",
              "Batizados"
            ]
          },
          {
            type: "image",
            name: "thumbnail",
            label: "Imagem de Capa",
            required: true
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
                label: "Imagem"
              },
              {
                type: "string",
                name: "caption",
                label: "Legenda"
              }
            ]
          },
          {
            type: "string",
            name: "description",
            label: "Descri\xE7\xE3o",
            ui: {
              component: "textarea"
            }
          },
          {
            type: "datetime",
            name: "date",
            label: "Data do Evento"
          },
          {
            type: "string",
            name: "instagramUrl",
            label: "Link do Instagram"
          }
        ]
      }
    ]
  }
});
export {
  config_default as default
};
