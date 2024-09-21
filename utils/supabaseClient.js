const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bigrhcxvvnaovhnjzijh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJpZ3JoY3h2dm5hb3Zobmp6aWpoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjY5MjY4OTIsImV4cCI6MjA0MjUwMjg5Mn0.z-TfXfhK4IIVDZo3t73XKQHaaFT124n26xD3vIwcr-0';

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;