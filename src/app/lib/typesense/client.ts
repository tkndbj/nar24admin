import Typesense from 'typesense';

if (!process.env.NEXT_PUBLIC_TYPESENSE_HOST) {
  throw new Error('NEXT_PUBLIC_TYPESENSE_HOST is not defined');
}

if (!process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_API_KEY) {
  throw new Error('NEXT_PUBLIC_TYPESENSE_SEARCH_API_KEY is not defined');
}

export const typesenseClient = new Typesense.Client({
  nodes: [
    {
      host: process.env.NEXT_PUBLIC_TYPESENSE_HOST,
      port: Number(process.env.NEXT_PUBLIC_TYPESENSE_PORT || '443'),
      protocol: process.env.NEXT_PUBLIC_TYPESENSE_PROTOCOL || 'https',
    },
  ],
  apiKey: process.env.NEXT_PUBLIC_TYPESENSE_SEARCH_API_KEY,
  connectionTimeoutSeconds: 5,
});
