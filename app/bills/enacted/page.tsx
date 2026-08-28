import { makeHubPage } from '../_hub/hub-page';

const { generateMetadata, Page } = makeHubPage('/bills/enacted');

export { generateMetadata };
export default Page;
