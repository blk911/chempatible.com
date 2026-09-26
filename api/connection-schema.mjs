// Prepare the connection store on a fresh deployment. Cache only a successful
// migration so a transient database failure can be retried by the next request.
let ready;
export function ensureConnectionSchema(sql){
 if(!ready){
  ready=sql`CREATE TABLE IF NOT EXISTS connection_state (
    invitation_hash text PRIMARY KEY REFERENCES invitations(token_hash) ON DELETE CASCADE,
    prospect_name text,
    prospect_photo text,
    prospect_answers jsonb NOT NULL DEFAULT '[]'::jsonb,
    prospect_phone text,
    prospect_email text,
    status text NOT NULL DEFAULT 'invited',
    messages jsonb NOT NULL DEFAULT '[]'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`.catch(error=>{ready=undefined;throw error});
 }
 return ready;
}
