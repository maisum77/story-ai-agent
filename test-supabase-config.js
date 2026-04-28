const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pbysygduxntqtcbryifn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXN5Z2R1eG50cXRjYnJ5aWZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1NTk0NSwiZXhwIjoyMDkyNTMxOTQ1fQ.9DEDZE67VP2vhvptxFiLwuuNMfm1i55-iKqHzHwJEOs';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testSupabase() {
  console.log('Testing Supabase connectivity and configuration...');
  
  try {
    // Test 1: Check if we can connect to Supabase
    console.log('\n1. Testing Supabase connection...');
    const { data: healthData, error: healthError } = await supabase.from('_health').select('*').limit(1);
    if (healthError) {
      console.log('   Health check error:', healthError.message);
    } else {
      console.log('   ✓ Supabase connection successful');
    }
    
    // Test 2: Check if email authentication is enabled
    console.log('\n2. Checking email authentication configuration...');
    try {
      // Try to get auth settings (this might require admin API)
      const { data: settings, error: settingsError } = await supabase.auth.getSettings();
      if (settingsError) {
        console.log('   Auth settings error:', settingsError.message);
      } else {
        console.log('   ✓ Auth settings retrieved');
        console.log('   Settings:', JSON.stringify(settings, null, 2));
      }
    } catch (authError) {
      console.log('   Auth API error:', authError.message);
    }
    
    // Test 3: Check site URL configuration
    console.log('\n3. Checking site URL configuration...');
    try {
      // Use the service role key to check site URL
      const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const settings = await response.json();
        console.log('   ✓ Site URL settings retrieved');
        console.log('   Site URL:', settings.SITE_URL);
        console.log('   Additional Redirect URLs:', settings.URI_ALLOW_LIST);
      } else {
        console.log('   Failed to get site URL settings:', response.status, response.statusText);
      }
    } catch (fetchError) {
      console.log('   Fetch error:', fetchError.message);
    }
    
    // Test 4: Try to send a test magic link (to a test email)
    console.log('\n4. Testing magic link sending...');
    const testEmail = 'test@example.com';
    const { data: signInData, error: signInError } = await supabase.auth.signInWithOtp({
      email: testEmail,
      options: {
        emailRedirectTo: 'http://localhost:3001/auth/callback'
      }
    });
    
    if (signInError) {
      console.log('   Magic link error:', signInError.message);
      console.log('   Error code:', signInError.code);
      console.log('   Error status:', signInError.status);
      
      // Check if it's a rate limiting error
      if (signInError.message.includes('rate limit') || signInError.status === 429) {
        console.log('   ⚠️ Rate limiting detected - this is expected for test emails');
      } else if (signInError.message.includes('disabled')) {
        console.log('   ❌ Email authentication might be disabled in Supabase dashboard');
      }
    } else {
      console.log('   ✓ Magic link sent successfully (check rate limiting)');
    }
    
    // Test 5: Check CORS configuration
    console.log('\n5. Checking CORS configuration...');
    try {
      // Make a cross-origin request to test CORS
      const corsResponse = await fetch(`${supabaseUrl}/auth/v1/health`, {
        method: 'GET',
        headers: {
          'apikey': supabaseServiceKey,
        },
        mode: 'cors'
      });
      
      console.log('   CORS test response status:', corsResponse.status);
      const corsHeaders = corsResponse.headers;
      console.log('   Access-Control-Allow-Origin:', corsHeaders.get('access-control-allow-origin'));
      console.log('   Access-Control-Allow-Methods:', corsHeaders.get('access-control-allow-methods'));
    } catch (corsError) {
      console.log('   CORS test error:', corsError.message);
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testSupabase();