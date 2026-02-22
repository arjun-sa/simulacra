declare module '@databricks/sql' {
  interface ConnectOptions {
    token: string;
    host: string;
    path: string;
  }

  interface ExecuteOptions {
    runAsync?: boolean;
  }

  interface Operation {
    fetchAll(): Promise<unknown[]>;
    close(): Promise<void>;
  }

  interface Session {
    executeStatement(statement: string, options?: ExecuteOptions): Promise<Operation>;
    close(): Promise<void>;
  }

  interface ConnectedClient {
    openSession(): Promise<Session>;
    close(): Promise<void>;
  }

  export class DBSQLClient {
    connect(options: ConnectOptions): Promise<ConnectedClient>;
  }
}
