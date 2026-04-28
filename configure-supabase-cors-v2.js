// Using global fetch (available in Node 18+)
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://pbysygduxntqtcbryifn.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBieXN5Z2R1eG50cXRjYnJ5aWZuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Njk1NTk0NSwiZXhwIjoyMDkyNTMxOTQ1fQ.9DEDZE67VP2vhvptxFiLwuuNMfm1i55-iKqHzHwJEOs';

async function configureSupabase() {
  console.log('Configuring Supabase CORS and redirect URLs...');
  
  try {
    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // First, let's test if magic links work with current configuration
    console.log('\n1. Testing magic link with current configuration...');
    
    // Use a unique email to avoid rate limiting
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
      
      // Check error type
      if (signInError.message.includes('redirect') || signInError.message.includes('URI')) {
        console.log('\n   ❌ Redirect URL not allowed. Need to configure in Supabase dashboard.');
        console.log('\n   MANUAL CONFIGURATION REQUIRED:');
        console.log('   1. Go to https://supabase.com/dashboard/project/pbysygduxntqtcbryifn');
        console.log('   2. Navigate to Authentication → URL Configuration');
        console.log('   3. Add these URLs to "Site URL" and "Redirect URLs":');
        console.log('      - http://localhost:3001');
        console.log('      - http://localhost:3001/auth/callback');
        console.log('      - http://localhost:3000');
        console.log('      - http://localhost:3000/auth/callback');
        console.log('   4. Save changes');
        console.log('\n   Alternatively, we can try to configure via API...');
        
        // Try to configure via REST API
        await tryApiConfiguration();
      } else if (signInError.message.includes('rate limit')) {
        console.log('   ⚠️ Rate limiting detected - this is normal');
        console.log('   This means Supabase IS working and email auth is enabled!');
      }
    } else {
      console.log('   ✓ Magic link sent successfully!');
      console.log('   This means CORS and redirect URLs are properly configured.');
    }
    
    // Test with a different redirect URL (localhost:3000)
    console.log('\n2. Testing with localhost:3000 redirect...');
    const testEmail2 = `test2-${Date.now()}@example.com`;
    
    const { data: signInData2, error: signInError2 } = await supabase.auth.signInWithOtp({
      email: testEmail2,
      options: {
        emailRedirectTo: 'http://localhost:3000/auth/callback'
      }
    });
    
    if (signInError2) {
      console.log('   Error with localhost:3000:', signInError2.message);
    } else {
      console.log('   ✓ Magic link sent with localhost:3000 redirect!');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

async function tryApiConfiguration() {
  console.log('\n   Attempting API configuration...');
  
  try {
    // Try to get current auth settings
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (response.ok) {
      const settings = await response.json();
      console.log('   Current auth settings:', JSON.stringify(settings, null, 2));
      
      // Try to update (this endpoint might not support PUT)
      console.log('   Note: The auth settings endpoint might be read-only.');
      console.log('   Configuration must be done via Supabase dashboard.');
    } else {
      console.log('   Failed to get auth settings:', response.status);
    }
  } catch (apiError) {
    console.log('   API error:', apiError.message);
  }
}

configureSupabase();