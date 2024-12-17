// Define User Interface
interface User {
    id: number;
    username: string;
    firstname: string;
    lastname: string;
    email: string;
    phoneNumber: string;
    gender: string;
    country: string;
}

// Define Agent Interface
interface Agent {
    user: User;
}

// Define Transaction Interface
interface Transaction {
    id: number;
    departmentId: number;
    categoryId: number;
    subCategoryId: number;
    countryId: number;
    cardType?: string;
    cardNumber?: string;
    amount: number;
    exchangeRate?: number;
    amountNaira?: number;
    agentId: number;
    cryptoAmount?: number;
    fromAddress?: string;
    toAddress?: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    agent: Agent;
}
interface AgentTransactionResponse {
    status: string;
    data: Transaction[]
}


interface Department {
    id: number;
    title: string;
    description: string;
    icon: string;
    createdAt: string; // Use `Date` if you parse it as a JavaScript Date object
    updatedAt: string; // Use `Date` if you parse it as a JavaScript Date object
    status: string;
    noOfAgents: number;
  }
  
  interface ApiResponse<T> {
    status: string;
    message: string;
    data: T;
  }
  
  // Specific response type for departments
  type DepartmentsResponse = ApiResponse<Department[]>;
  