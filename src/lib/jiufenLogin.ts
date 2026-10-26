export function jiufenLoginReturn(next:string|null):string{
 return next&&/^\/jiufen(?:\?|$)/.test(next)&&!/[\r\n\\]/.test(next)?next:'/'
}
