module.exports = function handler(_request, response) {
    const url = process.env.SUPABASE_URL
        || process.env.VITE_SUPABASE_URL
        || process.env.NEXT_PUBLIC_SUPABASE_URL
        || "";

    const anonKey = process.env.SUPABASE_ANON_KEY
        || process.env.VITE_SUPABASE_ANON_KEY
        || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        || "";

    response.status(200).json({ url, anonKey });
};
