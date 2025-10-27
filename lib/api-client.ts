// API Client Service for Frontend-Backend Communication

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function fetchApi(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new ApiError(response.status, data.error || 'Request failed');
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(500, 'Network error');
  }
}

// ============= Authentication =============

export const authApi = {
  async login(email: string, password: string) {
    return fetchApi('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async register(data: {
    name: string;
    email: string;
    password: string;
    fullName?: string;
    address?: string;
    phone?: string;
    type?: string;
    companyName?: string;
    companyAddress1?: string;
    companyAddress2?: string;
    companyCity?: string;
    companyState?: string;
    companyZip?: string;
    companyWebsite?: string;
  }) {
    return fetchApi('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },
};

// ============= Companies =============

export const companiesApi = {
  async getAll(consultantId: string) {
    return fetchApi(`/api/companies?consultantId=${consultantId}`);
  },

  async create(data: {
    name: string;
    consultantId: string;
    location?: string;
    industrySector?: number;
  }) {
    return fetchApi('/api/companies', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: {
    name?: string;
    addressStreet?: string;
    addressCity?: string;
    addressState?: string;
    addressZip?: string;
    addressCountry?: string;
    industrySector?: number;
  }) {
    return fetchApi('/api/companies', {
      method: 'PATCH',
      body: JSON.stringify({ id, ...data }),
    });
  },

  async updatePricing(id: string, monthly: number, quarterly: number, annual: number) {
    return fetchApi('/api/companies', {
      method: 'PUT',
      body: JSON.stringify({ 
        id, 
        subscriptionMonthly: monthly,
        subscriptionQuarterly: quarterly,
        subscriptionAnnual: annual
      }),
    });
  },

  async delete(id: string) {
    return fetchApi(`/api/companies?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// ============= Users =============

export const usersApi = {
  async getByCompany(companyId: string, userType?: 'COMPANY' | 'ASSESSMENT') {
    let url = `/api/users?companyId=${companyId}`;
    if (userType) url += `&userType=${userType}`;
    return fetchApi(url);
  },

  async create(data: {
    name: string;
    title?: string;
    phone?: string;
    email: string;
    password: string;
    companyId: string;
    userType: 'COMPANY' | 'ASSESSMENT';
  }) {
    return fetchApi('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchApi(`/api/users?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// ============= Consultants =============

export const consultantsApi = {
  async getAll() {
    return fetchApi('/api/consultants');
  },

  async create(data: {
    fullName: string;
    email: string;
    password: string;
    address?: string;
    phone?: string;
    type?: string;
  }) {
    return fetchApi('/api/consultants', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async update(id: string, data: {
    fullName?: string;
    email?: string;
    address?: string;
    phone?: string;
    type?: string;
    companyName?: string;
    companyAddress1?: string;
    companyAddress2?: string;
    companyCity?: string;
    companyState?: string;
    companyZip?: string;
    companyWebsite?: string;
  }) {
    return fetchApi('/api/consultants', {
      method: 'PUT',
      body: JSON.stringify({ id, ...data }),
    });
  },

  async delete(id: string) {
    return fetchApi(`/api/consultants?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// ============= Financial Data =============

export const financialsApi = {
  async getByCompany(companyId: string) {
    return fetchApi(`/api/financials?companyId=${companyId}`);
  },

  async upload(data: {
    companyId: string;
    uploadedByUserId: string;
    fileName: string;
    rawData: any;
    columnMapping: any;
    monthlyData: any[];
  }) {
    return fetchApi('/api/financials', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchApi(`/api/financials?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// ============= Assessments =============

export const assessmentsApi = {
  async getByCompany(companyId: string) {
    return fetchApi(`/api/assessments?companyId=${companyId}`);
  },

  async getByUser(userId: string) {
    return fetchApi(`/api/assessments?userId=${userId}`);
  },

  async create(data: {
    userId: string;
    companyId: string;
    responses: any;
    notes: any;
    overallScore: number;
  }) {
    return fetchApi('/api/assessments', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async delete(id: string) {
    return fetchApi(`/api/assessments?id=${id}`, {
      method: 'DELETE',
    });
  },
};

// ============= Company Profiles =============

export const profilesApi = {
  async get(companyId: string) {
    return fetchApi(`/api/profiles?companyId=${companyId}`);
  },

  async save(companyId: string, profileData: any) {
    return fetchApi('/api/profiles', {
      method: 'POST',
      body: JSON.stringify({ companyId, ...profileData }),
    });
  },

  async delete(companyId: string) {
    return fetchApi(`/api/profiles?companyId=${companyId}`, {
      method: 'DELETE',
    });
  },
};

// ============= Industry Benchmarks =============

export const benchmarksApi = {
  async get(industryId: string, assetSize?: string) {
    const params = new URLSearchParams({ industryId });
    if (assetSize) {
      params.append('assetSize', assetSize);
    }
    return fetchApi(`/api/benchmarks?${params.toString()}`);
  },
};

