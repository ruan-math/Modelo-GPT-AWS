// Configurações de ambiente para Assistente Virtual CAGE-RS
export const env = {
    NEXT_PUBLIC_AZURE_CLIENT_ID: process.env.NEXT_PUBLIC_AZURE_CLIENT_ID || "8293e4ba-dc6b-4d3f-a6a3-78e7c76acbef",
    NEXT_PUBLIC_AZURE_TENANT_ID: process.env.NEXT_PUBLIC_AZURE_TENANT_ID || "d9c79274-985c-4c0f-becf-0a04170d2c20",
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    NEXT_PUBLIC_COSMOSDB_ENDPOINT: process.env.NEXT_PUBLIC_COSMOSDB_ENDPOINT || "https://iagenerativacagedb.documents.azure.com:443/",
    NEXT_PUBLIC_COSMOSDB_PRIMARY_KEY: process.env.NEXT_PUBLIC_COSMOSDB_PRIMARY_KEY,
    NEXT_PUBLIC_COSMOSDB_DATABASE: process.env.NEXT_PUBLIC_COSMOSDB_DATABASE || "cagesefaz-db",
    NEXT_PUBLIC_COSMOSDB_CONTAINER_PREFIX: process.env.NEXT_PUBLIC_COSMOSDB_CONTAINER_PREFIX || "cagesefaz-db",
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Assistente Virtual Cage Sefaz-RS",
    NEXT_PUBLIC_APP_DESCRIPTION: process.env.NEXT_PUBLIC_APP_DESCRIPTION || "Chatbot inteligente para atendimento da CAGE SEFAZ-RS",
    NEXT_PUBLIC_APP_COMPLIANCE: process.env.NEXT_PUBLIC_APP_COMPLIANCE || "true",
    NEXT_PUBLIC_APP_LANG: process.env.NEXT_PUBLIC_APP_LANG || "pt-br",
    NEXT_PUBLIC_APP_USE_AI_SEARCH_FILTER: process.env.NEXT_PUBLIC_APP_USE_AI_SEARCH_FILTER || "true"
};