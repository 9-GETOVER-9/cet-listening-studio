// Each React effect setup owns its own lifetime, including resources registered after an await.
export function createJiufenLifecycle(){
 let cancelled=false
 const cleanups=new Set<()=>void>()
 return {active:()=>!cancelled,own(cleanup:()=>void){if(cancelled)cleanup();else cleanups.add(cleanup)},cancel(){if(cancelled)return;cancelled=true;for(const cleanup of cleanups)cleanup();cleanups.clear()}}
}
