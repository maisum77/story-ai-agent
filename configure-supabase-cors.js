const fetch = require('node-fetch');

const supabaseUrl = 'https://pbysygduxntqtcbryifn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXN5Z2R1eG50cXRjYnJ5aWZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1NTk0NSwiZXhwIjoyMDkyNTMxOTQ1fQ.9DEDZE67VP2vhvptxFiLwuuNMfm1i55-iKqHzHwJEOs';

async function configureSupabase() {
  console.log('Configuring Supabase CORS and redirect URLs...');
  
  try {
    // First, get current configuration
    console.log('\n1. Getting current configuration...');
    const getResponse = await fetch(`${supabaseUrl}/rest/v1/project_config`, {
      method: 'GET',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (getResponse.ok) {
      const config = await getResponse.json();
      console.log('   Current config:', JSON.stringify(config, null, 2));
    } else {
      console.log('   Failed to get config:', getResponse.status, getResponse.statusText);
    }
    
    // Try to update site URL via REST API (this might not be available)
    console.log('\n2. Attempting to update site URL via auth settings...');
    
    // According to Supabase docs, we need to use the GoTrue admin API
    // Try to update the site URL and redirect URLs
    const updatePayload = {
      SITE_URL: 'http://localhost:3001',
      URI_ALLOW_LIST: 'http://localhost:3001,http://localhost:3001/auth/callback,http://localhost:3000,http://localhost:3000/auth/callback'
    };
    
    const updateResponse = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      method: 'PUT',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatePayload)
    });
    
    if (updateResponse.ok) {
      console.log('   ✓ Successfully updated auth settings');
      const result = await updateResponse.json();
      console.log('   Result:', JSON.stringify(result, null, 2));
    } else {
      console.log('   Failed to update auth settings:', updateResponse.status, updateResponse.statusText);
      const errorText = await updateResponse.text();
      console.log('   Error details:', errorText);
    }
    
    // Alternative: Use the Supabase Management API
    console.log('\n3. Trying Supabase Management API...');
    
    // Get project ID from URL
    const projectId = 'pbysygduxntqtcbryifn';
    
    // Note: Management API requires a different token (supabase_access_token)
    // We'll skip this for now since we don't have that token
    
    // Instead, let's test if the current configuration works
    console.log('\n4. Testing current configuration with magic link...');
    
    // Create a test client
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Try with a different email to avoid rate limiting
    const testEmail = `test-${Date.now()}@example.com`;
    console.log(`   Using test email: ${testEmail}`);
    
    const { data: signInData, error: signInError } = await supabase.auth.signInWithOtp({
      email: testEmail,
      options: {
        emailRedirectTo: 'http://localhost:3001/auth/callback'
      }
    });
    
    if (signInError) {
      console.log('   Magic link error:', signInError.message);
      
      if (signInError.message.includes('redirect')) {
        console.log('   ❌ Redirect URL not allowed. Need to configure in Supabase dashboard.');
        console.log('\n   MANUAL CONFIGURATION REQUIRED:');
        console.log('   1. Go to https://supabase.com/dashboard/project/pbysygduxntqtcbryifn/auth/url-configuration');
        console.log('   2. Add these URLs to "Site URL" and "Redirect URLs":');
        console.log('      - http://localhost:3001');
        console.log('      - http://localhost:3001/auth/callback');
        console.log('      - http://localhost:3000');
        console.log('      - http://localhost:3000/auth/callback');
        console.log('   3. Save changes');
      }
    } else {
      console.log('   ✓ Magic link sent successfully!');
      console.log('   This means CORS and redirect URLs are properly configured.');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

configureSupabase();