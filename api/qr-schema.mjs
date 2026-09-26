let ready;
export function ensureQrSchema(sql){
 if(!ready)ready=(async()=>{
  await sql`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS sender_member_id uuid`;
  await sql`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'email'`;
  await sql`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at timestamptz`;
  await sql`ALTER TABLE connection_state ADD COLUMN IF NOT EXISTS claim_hash text`;
 })().catch(error=>{ready=undefined;throw error});
 return ready;
}
