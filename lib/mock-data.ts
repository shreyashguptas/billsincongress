import { Bill } from './types';

export const mockBills: Bill[] = [
  {
    id: 'hr1234',
    title: 'Clean Energy Innovation Act of 2024',
    sponsor: 'Rep. John Smith',
    introduced: '2024-03-15',
    status: 'In Committee',
    progress: 25,
    summary: 'A comprehensive bill to accelerate clean energy development and promote renewable energy solutions across the United States. This legislation aims to modernize our energy infrastructure while creating sustainable jobs and reducing carbon emissions.',
    tags: ['Energy', 'Environment', 'Innovation'],
  },
  {
    id: 'hr5678',
    title: 'Digital Privacy Protection Act',
    sponsor: 'Rep. Sarah Johnson',
    introduced: '2024-03-10',
    status: 'Passed House',
    progress: 65,
    summary: 'Strengthening online privacy protections for consumers by establishing clear data collection guidelines, enhancing user control over personal information, and implementing stricter penalties for data breaches.',
    tags: ['Technology', 'Privacy', 'Consumer Protection'],
  },
  {
    id: 'hr9012',
    title: 'Education Modernization Act',
    sponsor: 'Rep. Michael Brown',
    introduced: '2024-03-08',
    status: 'Introduced',
    progress: 10,
    summary: 'Modernizing educational infrastructure and curriculum standards to meet the demands of the 21st century. This bill focuses on STEM education, digital literacy, and equitable access to educational resources.',
    tags: ['Education', 'Technology', 'Infrastructure'],
  },
  {
    id: 'hr5679',
    title: 'Renewable Energy Development Act',
    sponsor: 'Rep. Lisa Chen',
    introduced: '2024-03-05',
    status: 'In Committee',
    progress: 30,
    summary: 'Promoting the development and deployment of renewable energy technologies through tax incentives, research grants, and infrastructure investments.',
    tags: ['Energy', 'Environment', 'Economy'],
  },
  {
    id: 'hr5680',
    title: 'Clean Air Enhancement Act',
    sponsor: 'Rep. David Martinez',
    introduced: '2024-03-01',
    status: 'Passed Committee',
    progress: 45,
    summary: 'Strengthening air quality standards and enforcement mechanisms to protect public health and reduce pollution from industrial sources.',
    tags: ['Environment', 'Health', 'Regulation'],
  }
];