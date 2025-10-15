declare module 'intuit-oauth' {
  export default class OAuthClient {
    constructor(config: any);
    authorizeUri(params: any): string;
    createToken(url: string): Promise<any>;
    getToken(): any;
    getKeyFromQBResponse(param: string, value: string): any;
    isAccessTokenValid(): boolean;
    refresh(): Promise<any>;
    refreshUsingToken(refresh_token: string): Promise<any>;
    revoke(params?: any): Promise<any>;
    makeApiCall(params: any): Promise<any>;
  }
}


