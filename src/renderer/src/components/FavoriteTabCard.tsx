import { Tab } from '@renderer/lib/tab';
import { Card, CardBody, Tooltip } from '@heroui/react';

export default function FavoriteTabCard({
  tab
} : {
  tab: Tab
}) {
  return (
    <Tooltip title={tab.name || tab.url}>
      <Card>
        <CardBody>
          <img src={tab.favicon} alt=""/>
        </CardBody>
      </Card>
    </Tooltip>
  );
}
