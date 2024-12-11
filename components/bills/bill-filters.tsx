'use client';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function BillFilters() {
  return (
    <div className="flex flex-wrap gap-4">
      <Select defaultValue="latest">
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Sort by" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="latest">Latest First</SelectItem>
          <SelectItem value="oldest">Oldest First</SelectItem>
          <SelectItem value="popular">Most Popular</SelectItem>
        </SelectContent>
      </Select>

      <Select defaultValue="all">
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Status</SelectItem>
          <SelectItem value="introduced">Introduced</SelectItem>
          <SelectItem value="committee">In Committee</SelectItem>
          <SelectItem value="passed_house">Passed House</SelectItem>
          <SelectItem value="passed_senate">Passed Senate</SelectItem>
          <SelectItem value="enacted">Enacted</SelectItem>
        </SelectContent>
      </Select>

      <Select defaultValue="all">
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Categories</SelectItem>
          <SelectItem value="healthcare">Healthcare</SelectItem>
          <SelectItem value="education">Education</SelectItem>
          <SelectItem value="environment">Environment</SelectItem>
          <SelectItem value="technology">Technology</SelectItem>
          <SelectItem value="finance">Finance</SelectItem>
        </SelectContent>
      </Select>

      <Button variant="outline">Clear Filters</Button>
    </div>
  );
}