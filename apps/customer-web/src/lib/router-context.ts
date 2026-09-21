export interface RouterAuthContext {
  isLoaded: boolean
  isSignedIn: boolean
}

export interface RouterContext {
  auth: RouterAuthContext
}
